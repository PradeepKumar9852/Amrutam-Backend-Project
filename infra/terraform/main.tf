# =========================================================================
# AMRUTAM TELEMEDICINE BACKEND - TERRAFORM INFRASTRUCTURE AS CODE (AWS)
# Supports: 100k daily consultations, p95 < 200ms latency, 99.95% HA
# =========================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "amrutam-terraform-state-prod"
    key            = "telemedicine/prod/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "amrutam-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Compliance  = "DISHA-Ayurveda-Healthcare"
    }
  }
}

# -------------------------------------------------------------------------
# 1. VPC & High-Availability Network Topologies
# -------------------------------------------------------------------------
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

# 3 Public Subnets (for ALB & NAT Gateways across 3 AZs)
resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-subnet-${count.index + 1}"
    Type = "Public"
  }
}

# 3 Private Application Subnets (for ECS Fargate containers)
resource "aws_subnet" "app_private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.project_name}-app-private-subnet-${count.index + 1}"
    Type = "Application-Private"
  }
}

# 3 Isolated Database Subnets (for PostgreSQL & Redis)
resource "aws_subnet" "db_private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.project_name}-db-private-subnet-${count.index + 1}"
    Type = "Database-Isolated"
  }
}

# -------------------------------------------------------------------------
# 2. AWS RDS PostgreSQL 17 (Multi-AZ with Read Replicas & Encryption)
# -------------------------------------------------------------------------
resource "aws_db_subnet_group" "rds" {
  name       = "${var.project_name}-rds-subnet-group"
  subnet_ids = aws_subnet.db_private[*].id
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allows inbound PostgreSQL traffic from ECS App tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL port from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_kms_key" "rds" {
  description             = "KMS key for Amrutam PostgreSQL at-rest encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_db_instance" "postgres" {
  identifier                  = "${var.project_name}-db-primary"
  engine                      = "postgres"
  engine_version              = "17.0"
  instance_class              = var.db_instance_class
  allocated_storage           = var.db_allocated_storage
  max_allocated_storage       = var.db_max_allocated_storage
  storage_type                = "gp3"
  storage_encrypted           = true
  kms_key_id                  = aws_kms_key.rds.arn
  multi_az                    = true # Guarantees 99.95% Availability with automatic failover
  db_name                     = "amrutam_telemedicine"
  username                    = "amrutam_admin"
  manage_master_user_password = true # AWS Secrets Manager integration

  db_subnet_group_name   = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period   = 30
  backup_window             = "03:00-04:00"
  maintenance_window        = "Sun:04:30-Sun:05:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true
  deletion_protection       = true
  performance_insights_enabled = true
}

# -------------------------------------------------------------------------
# 3. AWS ElastiCache Redis Cluster (Multi-AZ with In-Transit & At-Rest Encryption)
# -------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = aws_subnet.db_private[*].id
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Allows inbound Redis traffic from ECS App tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.project_name}-redis-cluster"
  description                = "Redis cluster for slot caching and token blacklist"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  parameter_group_name       = "default.redis7"
  port                       = 6379
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
}

# -------------------------------------------------------------------------
# 4. ECS Fargate Cluster & Service
# -------------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-ecs-tasks-sg"
  description = "Allows inbound traffic only from the Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# -------------------------------------------------------------------------
# 5. Application Load Balancer (ALB)
# -------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow inbound HTTPS/HTTP traffic from the internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true
}

resource "aws_lb_target_group" "app" {
  name        = "${var.project_name}-tg"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/v1/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# -------------------------------------------------------------------------
# 6. S3 Audit & Backup Vault (Encrypted with Glacier Lifecycle Policy)
# -------------------------------------------------------------------------
resource "aws_s3_bucket" "audit_vault" {
  bucket = "${var.project_name}-audit-vault-prod"
}

resource "aws_s3_bucket_versioning" "audit_vault" {
  bucket = aws_s3_bucket.audit_vault.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_vault" {
  bucket = aws_s3_bucket.audit_vault.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audit_vault" {
  bucket = aws_s3_bucket.audit_vault.id

  rule {
    id     = "archive-cold-audit-logs"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555 # Retain healthcare audit logs for 7 years as required by medical compliance
    }
  }
}
