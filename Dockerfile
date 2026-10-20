FROM node:22-bookworm-slim
WORKDIR /app
COPY testscraper/package.json testscraper/package-lock.json ./testscraper/
RUN npm ci --omit=dev --prefix testscraper
COPY testscraper/scraper.js testscraper/news-pipeline.js testscraper/scraper_cache.json testscraper/geocoding_cache.json ./testscraper/
COPY ["Final Project 3rd Year", "./Final Project 3rd Year"]
RUN mkdir /app/data && chown node:node /app/data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 SCRAPER_DATA_DIR=/app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "testscraper/scraper.js"]
