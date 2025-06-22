FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements-docker.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-docker.txt

# Copy application code
COPY nova_sonic_sync.py .

# Expose port
EXPOSE 3001

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV AWS_DEFAULT_REGION=us-east-1

# Run the application
CMD ["python", "nova_sonic_sync.py"]