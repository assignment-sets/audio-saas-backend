import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env_setup/env.js';

export const s3Client = new S3Client({
  region: env.AWS_REGION,
});

export const BUCKET_NAME = env.S3_BUCKET_NAME;
