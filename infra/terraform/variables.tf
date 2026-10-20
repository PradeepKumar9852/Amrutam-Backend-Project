variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-south-1" # Mumbai region for India-based telemedicine compliance
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project identifier"
  type        = string
  default     = "amrutam-telemedicine"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance type (Multi-AZ for high availability 99.95%)"
  type        = string
  default     = "db.r6g.xlarge"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum storage auto-scaling threshold in GB"
  type        = number
  default     = 1000
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "app_container_cpu" {
  description = "Fargate container CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "app_container_memory" {
  description = "Fargate container memory in MiB"
  type        = number
  default     = 2048
}

variable "app_desired_count" {
  description = "Baseline desired count of Fargate tasks"
  type        = number
  default     = 4
}
