FROM ubuntu:latest

# --- pacotes do sistema ---
RUN apt-get update && \
    apt-get install -y curl gnupg git python3 python3-pandas \
                       texlive-latex-recommended texlive-xetex make \
                       r-base r-base-dev \
                       libbz2-dev zlib1g-dev liblzma-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --- garante caminho global dos pacotes R ---
ENV R_LIBS_SITE=/usr/local/lib/R/site-library

# --- instala read.dbc de forma global ---
RUN mkdir -p /usr/local/lib/R/site-library && \
    Rscript -e "install.packages('read.dbc', repos='https://cloud.r-project.org', lib='/usr/local/lib/R/site-library')"

# --- Node 22 ---
RUN curl -sL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    node -v && npm -v

WORKDIR /app

# --- CACHE BUSTER REAL (funciona no Railway) ---
ADD https://api.github.com/repos/Marcolino5/susscript/git/refs/heads/main /tmp/susd_version.json

# --- clone atualizado SEM risco de cache antigo ---
RUN rm -rf susd && \
    git clone --depth 1 https://github.com/Marcolino5/susscript.git susd

# loga commit para debug
RUN git -C susd rev-parse --short HEAD > /app/SUSD_COMMIT
RUN echo "SUSD CLONADO:" && cat /app/SUSD_COMMIT

# --- copia backend (susd não será sobrescrito por causa do .dockerignore) ---
COPY . /app

RUN npm install
RUN npm audit fix || true
RUN npx prisma migrate dev --name init || true
RUN npm run build

EXPOSE 3001

CMD npx prisma migrate deploy && npm start
