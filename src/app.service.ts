import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma';
import { exec } from 'node:child_process';
import path from 'node:path/posix';
import { cwd } from 'node:process';
import fs from 'node:fs';

// TIPOS DO PROGRAMA
export interface HP_CreationData {
  cnes: string;
  nome_fantasia: string;
  razao_social: string;
  estado: string;
  cidade: string;
}

export interface USR_CreationData {
  nome: string;
  senha: string;
}

export interface USR_LoginData {
  nome: string;
  senha: string;
}

export interface LD_CreationData {
  cnes: string;
  sistema: 'SIA' | 'SIH';
  metodo: 'TUNEP' | 'IVR' | 'BEST';
  inicio: string;
  fim: string;
  fim_correcao: string;
  citacao: string;
  distribuicao: string;
  n_processo: string;
}

export interface ScriptParams {
  cnes: string;
  estado: string;
  cidade: string;
  razao_social: string;
  nome_fantasia: string;

  sistema: string;
  metodo: string;
  inicio: string;
  fim: string;
  fim_correcao: string;
  citacao: string;
  n_processo: string;
}

@Injectable()
export class AppService {
  constructor(private prisma: PrismaClient) {}

  getHello(): string {
    return 'Hello World!';
  }

  // ############# MÉTODOS DO HOSPITAL #############
  getHospital(cnes: string) {
    return this.prisma.hospital.findUnique({ where: { cnes: cnes } });
  }

  // cria um hospital. bastante simples.
  createHospital(data: HP_CreationData) {
    return this.prisma.hospital.create({ data: data });
  }

  // deleta um hospital junto com seus laudos.
  async deleteHospital(cnes: string) {
    const deleted_hosp = await this.prisma.hospital.delete({
      where: { cnes: cnes },
    });
    await this.deleteLaudosHospital(cnes);
    return deleted_hosp;
  }

  // lista todos os hospitais presentes no programa
  listHospitals() {
    return this.prisma.hospital.findMany();
  }

  debugHospitals() {}

  // ############# MÉTODOS DO LAUDO #############
  getLaudo(id: number) {
    return this.prisma.laudo.findUnique({ where: { id: id } });
  }

  /**  cria um laudo no banco de dados e requisita que os artefatos referentes a
   esse laudo sejam gerados. */
  async createLaudo(data: LD_CreationData) {
    // caso não haja hospital com o cnes do laudo informado, o programa deve retornar um erro
    const hosp = await this.getHospital(data.cnes);
    if (!hosp) {
      throw new HttpException(
        'Hospital referido pelo cnes não se encontra no banco de dados.',
        HttpStatus.NOT_FOUND,
      );
    }

    // caso já exista um laudo em processamento para o hospital informado, o programa deve retornar um erro
    if (await this.isProcessingHappening()) {
      void this.inspectProcessingState();
      throw new HttpException(
        'Ainda existe um laudo em processamento.',
        HttpStatus.CONFLICT,
      );
    }

    // cria o registro do laudo no banco de dados
    const laudo = await this.prisma.laudo.create({
      data: {
        cnes: data.cnes,
        data_inicio: data.inicio,
        metodo: data.metodo,
        sistema: data.sistema,
        data_fim: data.fim,
        fim_correcao: data.fim_correcao,
        data_citacao: data.citacao,
        data_distribuicao: data.distribuicao,
        n_processo: data.n_processo,
      },
    });

    const script_command = this.buildScriptCommand({
      cnes: data.cnes,
      estado: hosp.estado,
      sistema: data.sistema,
      inicio: data.inicio,
      fim: data.fim,
      razao_social: hosp.razao_social,
      nome_fantasia: hosp.nome_fantasia,
      fim_correcao: data.fim_correcao,
      citacao: data.citacao,
      cidade: hosp.cidade,
      n_processo: data.n_processo,
      metodo: data.metodo,
    });

    // roda o script que gera o laudo e administra seus efeitos colaterais nas funções callback
    exec(script_command, (err, stdout, stderr) => {
      if (err != null) {
        void this.handleScriptError(laudo.id, stdout, stderr);
        return;
      }
      void this.handleScriptConclusion(laudo.id);
    });

    // retorna o registro do laudo que foi registrado no banco de dados
    return laudo;
  }

  async handleScriptConclusion(id: number) {
    console.log('script concluído com sucesso!');
    await this.gatherScriptResults(id);
    try {
      await this.setLaudoReady(id, true);
    } catch (err: any) {
      console.log(`Erro ao atualizar o status do laudo de id: ${id}`);
      console.log('causa reportada', err);
    }
  }

  async handleScriptError(id: number, stdout: string, stderr: string) {
    console.log(`Script python falhou para laudo de id: ${id}`);
    console.log('STDOUT:');
    console.log(stdout);
    console.log('STDERR:');
    console.log(stderr);
    try {
      await this.deleteLaudo(id);
    } catch {
      console.log('não foi possível deletar o laudo');
    }
  }

  async setLaudoReady(id: number, state: boolean) {
    await this.prisma.laudo.update({
      where: { id: id },
      data: { ready: state },
    });
  }

  /** Move os arquivos gerados pelo script de processmento para a pasta onde armazenam-se os laudos */
  async gatherScriptResults(id: number) {
    const laudo_src = path.join(ProjPaths.scriptResultDir(), 'laudo.pdf');
    const laudo_dst = ProjPaths.storedLaudoPath(id);
    try {
      await fs.promises.rename(laudo_src, laudo_dst);
    } catch (err: any) {
      console.log(
        `não foi possível mover o arquivo ${laudo_src}, possivelmente porque ele não existe`,
      );
      console.log('a causa reportada foi: ', err);
      return await this.deleteLaudo(id);
    }

    const pa_csv_src = path.join(ProjPaths.unitedCsvsDir(), 'SIA.csv');
    const pa_csv_dst = ProjPaths.storedSiaCsvPath(id);
    try {
      await fs.promises.rename(pa_csv_src, pa_csv_dst);
    } catch {
      console.log(
        `não foi possível mover o arquivo ${pa_csv_src}, possivelmente porque ele não existe`,
      );
    }

    const sp_csv_src = path.join(ProjPaths.unitedCsvsDir(), 'SIH.csv');
    const sp_csv_dst = ProjPaths.storedSihCsvPath(id);
    try {
      await fs.promises.rename(sp_csv_src, sp_csv_dst);
    } catch {
      console.log(
        `não foi possível mover o arquivo ${sp_csv_src}, possivelmente porque ele não existe`,
      );
    }
  }

  /**  gera o comando necessário para gerar o laudo com base nos parâmetros fornecidos. */
  buildScriptCommand(params: ScriptParams): string {
    return `python3 ${ProjPaths.scriptPath()} "${params.cnes}" "${params.estado}" "${params.sistema}" "${params.metodo}" "${params.inicio}" "${params.fim}" "${params.fim_correcao}" "${params.citacao}" "${params.cidade}" "${params.razao_social}" "${params.nome_fantasia}" "${params.n_processo}"`;
  }

  /**  Deleta um laudo do banco de dados junto com os seus arquivos relacionados.*/
  async deleteLaudo(id: number) {
    const deleted_laudo = await this.prisma.laudo.delete({
      where: { id: id },
    });
    this.deleteLaudoFiles(id);
    return deleted_laudo;
  }

  /** Deleta os arquivos a um laudo */
  deleteLaudoFiles(id: number) {
    const laudo_path = path.join(ProjPaths.laudosDir(), `laudo_${id}.pdf`);
    const sia_csv_path = path.join(ProjPaths.laudosDir(), `SIA_${id}.csv`);
    const sih_csv_path = path.join(ProjPaths.laudosDir(), `SIH_${id}.csv`);
    try {
      fs.unlinkSync(laudo_path);
    } catch (err: any) {
      console.log(`Não foi possível deletar o arquivo ${laudo_path}.`);
      console.log('Esse é um comportamento atípico.');
      console.log('A causa reportada foi:', err);
    }

    try {
      fs.unlinkSync(sia_csv_path);
    } catch (err: any) {
      console.log(`Não foi possível deletar o arquivo ${sia_csv_path}`);
      console.log('É provável que isso não seja um erro.');
      console.log('A causa reportada foi:', err);
    }

    try {
      fs.unlinkSync(sih_csv_path);
    } catch (err: any) {
      console.log(`Não foi possível deletar o arquivo ${sih_csv_path}`);
      console.log('É provável que isso não seja um erro.');
      console.log('A causa reportada foi:', err);
    }
  }

  /**  deleta todos os laudos de um dado hospital garantindo que todos os
    arquivos referentes a esse laudo também sejam deletados.*/
  async deleteLaudosHospital(cnes: string) {
    const hosp_laudos = await this.listLaudosHosp(cnes);
    for (const laudo of hosp_laudos) {
      await this.deleteLaudo(laudo.id);
    }
  }

  /**  lista todos os laudos de um dado hospital.*/
  listLaudosHosp(cnes: string) {
    return this.prisma.laudo.findMany({
      where: { cnes: cnes },
    });
  }

  /** lista todos os laudos que ainda estão processando */
  listUnfinishedLaudos() {
    return this.prisma.laudo.findMany({
      where: {
        ready: false,
      },
    });
  }

  /** retorna true caso exista algum laudo no banco de dados que ainda esteja em processamento */
  async isProcessingHappening(): Promise<boolean> {
    const unfinished_laudo = await this.prisma.laudo.findFirst({
      where: { ready: false },
    });
    if (unfinished_laudo == null) {
      return false;
    }
    return true;
  }

  listAllLaudos() {
    return this.prisma.laudo.findMany();
  }

  /**  Garante que todos os laudos em andamento estejam em conformidade com as regras de negócio. */
  async inspectProcessingState() {
    const unfinished_laudos = await this.listUnfinishedLaudos();
    for (const laudo of unfinished_laudos) {
      // Se o laudo estiver em andamento há mais de 3 horas, deleta-o.
      if ((Date.now() - laudo.created_at.getTime()) / (1000 * 60 * 60) > 3) {
        try {
          await this.deleteLaudo(laudo.id);
        } catch (err: any) {
          console.log(
            `não foi possível deletar o laudo de id ${laudo.id}`,
            'causa reportada:',
            err,
          );
        }
      }
    }
  }

  /** Função para testes e procedimentos diagnósticos */
  debugLaudos() {
    ProjPaths.showResultsDir();
    ProjPaths.showUnitedCsvDir();
  }

  /** Retorna uma ReadStream do arquivo pdf de um dado laudo*/
  async streamPdf(id: number) {
    const laudo_file_path = ProjPaths.storedLaudoPath(id);
    const registro_laudo = await this.prisma.laudo.findUnique({
      where: { id: id },
    });

    if (registro_laudo == null) {
      throw new HttpException(
        `O laudo de id ${id}  não existe no banco de dados`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (!fs.existsSync(laudo_file_path)) {
      if (registro_laudo.ready == true) {
        void this.prisma.laudo.delete({ where: { id: id } });
      }
      throw new HttpException(
        'O documento indicado não foi encontrado.',
        HttpStatus.NOT_FOUND,
      );
    }

    return fs.createReadStream(laudo_file_path);
  }

  /** Retorna uma ReadStream do arquivo csv do sistema sia de um laudo */
  streamSiaCsv(id: number) {
    const csv_file_path = ProjPaths.storedSiaCsvPath(id);

    if (!fs.existsSync(csv_file_path)) {
      throw new HttpException(
        'O documento indicado não foi encontrado.',
        HttpStatus.NOT_FOUND,
      );
    }

    return fs.createReadStream(csv_file_path);
  }

  streamSihCsv(id: number) {
    const csv_file_path = ProjPaths.storedSihCsvPath(id);

    if (!fs.existsSync(csv_file_path)) {
      throw new HttpException(
        'O documento indicado não foi encontrado.',
        HttpStatus.NOT_FOUND,
      );
    }

    return fs.createReadStream(csv_file_path);
  }

  // Métodos de autenticação
  createUser(data: USR_CreationData) {
    return this.prisma.user.create({ data: data });
  }

  deleteUser(name: string) {
    return this.prisma.user.delete({ where: { nome: name } });
  }

  setAdmin(name: string, admin: boolean) {
    return this.prisma.user.update({
      where: { nome: name },
      data: { admin: admin },
    });
  }

  loginUser(data: USR_LoginData) {
    throw new Error('Not implemented');
    return data;
  }

  // Dado um Bearer token, a função verifica se o usuário existe no banco de dados.
  validateUserToken(token: string) {
    throw new Error('Not implemented');
    return token;
  }
}

class ProjPaths {
  // sla
  static homePath(): string {
    return cwd();
  }

  /**  home/susd */
  static scriptDir(): string {
    return path.join(ProjPaths.homePath(), 'susd');
  }

  /** home/susd/main.py */
  static scriptPath(): string {
    return path.join(ProjPaths.scriptDir(), 'main.py');
  }

  /**  home/laudos */
  static laudosDir(): string {
    return path.join(ProjPaths.homePath(), 'laudos');
  }

  /** home/susd/results */
  static scriptResultDir(): string {
    return path.join(ProjPaths.scriptDir(), 'results');
  }

  /** home/susd/united_csv */
  static unitedCsvsDir(): string {
    return path.join(ProjPaths.scriptDir(), 'united_csv');
  }

  static storedLaudoPath(id: number): string {
    return path.join(ProjPaths.laudosDir(), `laudo_${id}.pdf`);
  }

  static storedSiaCsvPath(id: number): string {
    return path.join(ProjPaths.laudosDir(), `SIA_${id}.csv`);
  }

  static storedSihCsvPath(id: number): string {
    return path.join(ProjPaths.laudosDir(), `SIH_${id}.csv`);
  }

  static showResultsDir() {
    const files = fs.readdirSync(ProjPaths.scriptResultDir());
    console.log("files found in script's results dir:");
    for (const file of files) {
      console.log(file);
    }
  }

  static showUnitedCsvDir() {
    const files = fs.readdirSync(ProjPaths.unitedCsvsDir());
    console.log("files found in script's united_csv dir:");
    for (const file of files) {
      console.log(file);
    }
  }
}
