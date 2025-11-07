FROM ubuntu:latest

RUN apt-get update
RUN apt-get install -y curl gnupg git
RUN apt-get install -y python3 python3-pandas
RUN apt-get install -y texlive-latex-recommended texlive-xetex
RUN apt-get install -y make

RUN curl -sL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs
RUN node -v && npm -v

WORKDIR /app

COPY . /app

RUN rm -fr susd
RUN npm install
RUN npm audit fix
RUN npx prisma migrate dev --name init
RUN npm run build

# 👇 Adicione estas linhas
ARG CACHE_BUSTER=1
RUN echo "Cache bust value: $CACHE_BUSTER"
RUN git clone --depth 1 https://github.com/Marcolino5/susscript.git susd


EXPOSE 3001

CMD ["npm", "start"]
