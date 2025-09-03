# 🚀 Docker Deployment Guide

## 📦 Available Docker Images

### Production Ready Images on Docker Hub:
- **`premkumarsk2005/unified-browser-platform:latest`** - Latest stable version with embedded API keys
- **`premkumarsk2005/unified-browser-platform:with-env`** - Same as latest, with embedded environment variables

## 🏃‍♂️ Quick Start

### Option 1: Pull and Run from Docker Hub
```bash
# Pull the latest image
docker pull premkumarsk2005/unified-browser-platform:latest

# Run the container
docker run -d -p 3000:3000 --name browser-platform premkumarsk2005/unified-browser-platform:latest
```

### Option 2: Using Docker Compose
```bash
# Using the provided docker-compose.yml
docker-compose up -d
```

## 🔧 Configuration Options

### Environment Variables (Embedded in Image)
The following API keys are already embedded in the Docker image:
- `AZURE_OPENAI_API_KEY` - For AI automation
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI service endpoint
- `GOOGLE_API_KEY` - For additional services

### Port Configuration
- **Internal Port**: 3000 (application server)
- **Mapped Port**: 3000 (or customize with `-p YOUR_PORT:3000`)

## 🌐 Access Points

After running the container:
- **Web Interface**: http://localhost:3000
- **WebRTC Streaming**: http://localhost:3000/webrtc-streaming.html
- **API Endpoint**: http://localhost:3000/api

## 📈 Scaling Options

### Single Container (Testing)
```bash
docker run -d -p 3000:3000 premkumarsk2005/unified-browser-platform:latest
```

### Multiple Containers (Load Balanced)
```bash
# Run multiple instances
docker run -d -p 3001:3000 --name browser-1 premkumarsk2005/unified-browser-platform:latest
docker run -d -p 3002:3000 --name browser-2 premkumarsk2005/unified-browser-platform:latest
docker run -d -p 3003:3000 --name browser-3 premkumarsk2005/unified-browser-platform:latest
```

### Production Scaling with Docker Compose
```yaml
version: '3.8'
services:
  browser-platform:
    image: premkumarsk2005/unified-browser-platform:latest
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 4G
          cpus: '2'
    ports:
      - "3000-3002:3000"
```

## 💾 Capacity Planning

### Resource Requirements
- **Memory**: 2-4GB per container
- **CPU**: 1-2 cores per container
- **Concurrent Users**: 10-15 users per 4GB container

### Scaling Strategy
- **Horizontal Scaling**: Add more containers for more users
- **Vertical Scaling**: Increase memory/CPU for better performance per container

## 🔍 Monitoring & Health Checks

### Container Health
```bash
# Check container status
docker ps

# View logs
docker logs browser-platform

# Monitor resource usage
docker stats browser-platform
```

### Application Health
```bash
# Health check endpoint
curl http://localhost:3000/health

# WebRTC status
curl http://localhost:3000/api/status
```

## 🛠 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Change the port mapping
   docker run -d -p 3001:3000 premkumarsk2005/unified-browser-platform:latest
   ```

2. **Container Won't Start**
   ```bash
   # Check logs for errors
   docker logs container-name
   ```

3. **Automation Not Working**
   - The latest image includes embedded API keys
   - No additional environment configuration needed

### Debug Mode
```bash
# Run with interactive mode for debugging
docker run -it -p 3000:3000 premkumarsk2005/unified-browser-platform:latest /bin/bash
```

## 📋 Version History

- **latest** - Production ready with embedded API keys and working automation
- **with-env** - Same as latest, explicitly tagged for environment variable version
- **v1.0** - Initial release (may require manual API key configuration)

## 🔐 Security Notes

- API keys are embedded in the image for convenience
- For production use, consider using Docker secrets or external key management
- The image runs with a non-root user for better security

## 📞 Support

For issues or questions:
1. Check container logs: `docker logs container-name`
2. Verify port accessibility: `curl http://localhost:3000/health`
3. Monitor resource usage: `docker stats`

---

🎉 **Ready to deploy!** Your unified browser platform with AI automation is now available on Docker Hub and ready for production use.
