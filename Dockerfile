FROM nginx:1.27-alpine
COPY index.html style.css app.js manifest.webmanifest /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
EXPOSE 80
