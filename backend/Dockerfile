FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*

# Base GeoLite2 (pays d'origine des événements du journal). Facultative :
# sans clé de licence MaxMind, l'image se construit quand même et le journal
# affiche l'adresse IP sans le pays — voir apps/core/geoip.py.
ARG MAXMIND_LICENSE_KEY=""
RUN mkdir -p /app/geoip \
    && if [ -n "$MAXMIND_LICENSE_KEY" ]; then \
        curl -fsSL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz" \
          -o /tmp/geoip.tar.gz \
        && tar -xzf /tmp/geoip.tar.gz -C /tmp \
        && find /tmp -name "GeoLite2-Country.mmdb" -exec mv {} /app/geoip/ \; \
        && rm -rf /tmp/geoip.tar.gz /tmp/GeoLite2-Country_*; \
       else echo "MAXMIND_LICENSE_KEY absente : pays non résolu dans le journal."; fi

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
