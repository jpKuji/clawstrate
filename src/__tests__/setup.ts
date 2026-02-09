import { vi } from "vitest";

// Mock environment variables
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
process.env.MOLTBOOK_API_KEY = "moltbook_test_key";
process.env.CRON_SECRET = "test-cron-secret";
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
