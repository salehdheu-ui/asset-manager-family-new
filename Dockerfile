FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY package*.json ./
# drizzle-kit أداة تطوير، لكن الحاوية المنشورة تحتاجها لتشغيل ترحيل المخطط
# بعد كل تحديث يضيف جدولاً. بدونها لا سبيل لإنشاء الجداول الجديدة في الإنتاج.
RUN npm install --omit=dev && npm install --no-save drizzle-kit@^0.31.4
COPY --from=build /app/dist ./dist
# ما يحتاجه npm run db:push داخل الحاوية: التهيئة وتعريف المخطط
COPY drizzle.config.ts ./
COPY shared ./shared
EXPOSE 5000
CMD ["npm", "run", "start"]
