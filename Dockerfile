FROM python:3.10-slim

# Previously based on: https://github.com/hellt/nginx-uwsgi-flask-alpine-docker
# Now based on: https://pythonspeed.com/articles/alpine-docker-python/

COPY ./config/requirements.txt /tmp/requirements.txt

RUN apt-get update && apt-get install -y gcc procps lsof net-tools python3 python3-wheel bash nginx uwsgi \
    uwsgi-plugin-python3 supervisor vim && python3 -m ensurepip \
    && pip3 install --upgrade pip setuptools \
    && pip3 install -r /tmp/requirements.txt

COPY ./config/nginx.conf /etc/nginx/
COPY ./config/flask-site-nginx.conf /etc/nginx/conf.d/

RUN rm -f /etc/nginx/fastcgi.conf /etc/nginx/fastcgi_params

COPY ./config/supervisord.conf /etc/supervisor/supervisord.conf
COPY ./config/uwsgi.ini /etc/uwsgi/apps-enabled/
COPY ./config/flask-site-nginx.conf /etc/nginx/sites-available/default

CMD ["ln", "-s", "/etc/nginx/sites-available/default", "/etc/nginx/sites-enabled/default"]
CMD ["rm", "/etc/uwsgi/apps-enabled/README"]

COPY ./app /app
WORKDIR /app
RUN chown -R www-data:www-data /app

ENV DSO_DB_PATH="/app/deepsky.db"
ENV DSO_LOG_PATH="/app/dso-guide.log"

CMD ["/usr/bin/supervisord"]
