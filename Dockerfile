FROM grafana/k6:latest
WORKDIR /tests

COPY . /tests
COPY entry.sh /usr/local/bin/entry.sh
USER root
RUN set -eux; \
    tr -d '\r' < /usr/local/bin/entry.sh > /usr/local/bin/entry.sh.tmp; \
    mv /usr/local/bin/entry.sh.tmp /usr/local/bin/entry.sh; \
    chmod 0755 /usr/local/bin/entry.sh; \
    mkdir -p /results

ENTRYPOINT ["sh", "/usr/local/bin/entry.sh"]
