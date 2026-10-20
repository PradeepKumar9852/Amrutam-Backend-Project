output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "rds_primary_endpoint" {
  description = "PostgreSQL primary read/write endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "redis_cluster_endpoint" {
  description = "Redis primary configuration endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "audit_vault_bucket_arn" {
  description = "ARN of the S3 audit log & backup vault"
  value       = aws_s3_bucket.audit_vault.arn
}
