FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY server/package*.json ./server/

# Install dependencies
WORKDIR /app/server
RUN npm install --production

# Copy all files
WORKDIR /app
COPY . .

# Expose port
EXPOSE 3000

# Wait for database and start
WORKDIR /app/server
CMD ["sh", "-c", "sleep 5 && npm run seed && npm start"]
