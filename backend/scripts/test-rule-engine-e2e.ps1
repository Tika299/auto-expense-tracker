$ErrorActionPreference = 'Stop'

$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/auto_expense_tracker_test'
$env:JWT_SECRET = 'e2e-test-secret-at-least-32-characters'
$env:JWT_EXPIRES_IN = '1h'

docker compose -f docker-compose.test.yml up -d --wait
npx drizzle-kit migrate
npm run test:e2e -- --runInBand

