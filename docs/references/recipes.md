# Configuration Recipes

## nginx

`nginx` is often used as a reverse proxy in front of the application, to dispatch to different backend programs based on the request route or other characteristics. In such a case it is recommended to run nginx and the application through a process manager like `supervisor`.

Example nginx supervisor configuration file:
```
[program:nginx]
directory=/tmp
command=/usr/sbin/nginx -g "daemon off;"
user=root
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/%(program_name)s.log
stderr_logfile=/var/log/supervisor/%(program_name)s.log
```

The nginx configuration, provided with the base image, can be used by adding an application specific config file under `/etc/nginx/sites-enabled/` when building the docker image.

```
ADD <app config file> /etc/nginx/sites-enabled/<app config file>
```

Since the base image nginx configuration is unpatched from the ubuntu package, the application configuration has to ensure nginx is using `/run/` instead of `/var/lib/nginx/` to support the read-only filesystem nature of a Cloudron application.

Example nginx app config file:
```
client_body_temp_path /run/client_body;
proxy_temp_path /run/proxy_temp;
fastcgi_temp_path /run/fastcgi_temp;
scgi_temp_path /run/scgi_temp;
uwsgi_temp_path /run/uwsgi_temp;

server {
  listen 8000;

  root /app/code/dist;

  location /api/v1/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
  }
}

```

## supervisor

Use this in the program's config:

```
[program:app]
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
```
