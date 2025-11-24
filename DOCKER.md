# Modbus Gateway - Docker Deployment

## Quick Start

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+

### Running with Docker Compose

1. **Clone the repository**
```bash
git clone https://github.com/r04nx/modbus-gate.git
cd modbus-gate
```

2. **Start the application**
```bash
docker-compose up -d
```

3. **Check status**
```bash
docker-compose ps
docker-compose logs -f
```

4. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

5. **Stop the application**
```bash
docker-compose down
```

6. **Stop and remove volumes (clean slate)**
```bash
docker-compose down -v
```

## Default Credentials
- Username: `admin`
- Password: `admin`

**⚠️ Change the default password immediately after first login!**

## Data Persistence

The application uses Docker volumes for data persistence:
- `backend-db`: Stores the SQLite database and buffered data
- `./data`: Host directory mounted for additional data storage

## Building Images

### Build all services
```bash
docker-compose build
```

### Build specific service
```bash
docker-compose build backend
docker-compose build frontend
```

### Rebuild without cache
```bash
docker-compose build --no-cache
```

## Development Mode

For development with live code reloading:

### Backend Development
```bash
cd backend
docker build -t modbus-gate-backend-dev .
docker run -it --rm \
  -p 8000:8000 \
  -v $(pwd):/app \
  -e PYTHONUNBUFFERED=1 \
  modbus-gate-backend-dev \
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

You can customize the deployment by creating a `.env` file:

```env
# Backend
BACKEND_PORT=8000

# Frontend
FRONTEND_PORT=3000

# Database
DB_PATH=/data/vistaiot.db
BUFFER_DB_PATH=/data/buffer.db
```

Then use it in docker-compose:
```bash
docker-compose --env-file .env up -d
```

## Troubleshooting

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Restart services
```bash
# All services
docker-compose restart

# Specific service
docker-compose restart backend
```

### Access container shell
```bash
# Backend
docker-compose exec backend /bin/bash

# Frontend
docker-compose exec frontend /bin/sh
```

### Check health status
```bash
docker-compose ps
```

### Remove all containers and volumes
```bash
docker-compose down -v
docker system prune -a
```

## Production Deployment

For production deployment:

1. **Use environment-specific compose file**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

2. **Set up reverse proxy (nginx/traefik)**
3. **Configure SSL/TLS certificates**
4. **Set up proper backup strategy for volumes**
5. **Configure monitoring and logging**

## Updating the Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

## Network Configuration

The application uses a custom bridge network `modbus-gate-network` for inter-container communication.

To connect external services:
```bash
docker network connect modbus-gate-network <container-name>
```

## Resource Limits

To set resource limits, create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
  
  frontend:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          memory: 128M
```

Then run:
```bash
docker-compose up -d
```
