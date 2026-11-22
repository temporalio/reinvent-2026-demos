FROM nginx:alpine
ENV CONTROL_HUB_URL=http://control-hub:8090
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY 15-dns.sh /docker-entrypoint.d/15-dns.envsh
RUN chmod +x /docker-entrypoint.d/15-dns.envsh
EXPOSE 8080
