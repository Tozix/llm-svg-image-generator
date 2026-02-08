FROM node:22.19-slim
LABEL authors='Tozix' version=1.1.0
WORKDIR /app
COPY package*.json ./
COPY . .
RUN apt update -y && apt install -y openssl openresolv nano curl unzip
RUN npm install -g npm@latest
RUN npm i
# Собираем проект
RUN npm run build

# Запускаем приложение
CMD ["npm", "start"]
