FROM ubuntu:latest

# --- Pacotes do sistema (mantendo tudo que você usava) ---
RUN apt-get update && \
    apt-get install -y curl gnupg git python3 python3-pandas \
                       texlive-latex-recommended texlive-xetex make && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --- Node 22 (como antes) ---
RUN curl -sL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    node -v && npm -v

WORKDIR /app

# --- Força o clone a sempre atualizar quando houver commits (cache buster) ---
ARG CACHE_BUSTER=1
RUN echo "CACHE_BUSTER=$CACHE_BUSTER"

# --- Clone SEM cache e sem versão antiga permanecendo ---
RUN rm -rf susd && \
    git clone --depth 1 https://github.com/Marcolino5/susscript.git susd

    
# --- Grava qual commit foi clonado (para confirmar nos logs) ---
RUN git -C susd rev-parse --short HEAD > /app/SUSD_COMMIT || echo "no-commit" > /app/SUSD_COMMIT
RUN echo "SUSD COMMIT CLONADO:" && cat /app/SUSD_COMMIT

# --- Copia seu backend (não sobrescreve susd porque .dockerignore vai proteger) ---
COPY . /app

# --- Instala dependências e build (mantido da sua versão original) ---
RUN npm install
RUN npm audit fix || true
RUN npx prisma migrate dev --name init || true
RUN npm run build

EXPOSE 3001

# --- Run (igual ao seu comando inicial, apenas acrescentando migrate deploy por segurança) ---
CMD npx prisma migrate deploy && npm start