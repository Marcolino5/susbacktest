import {
  Body,
  Delete,
  Controller,
  Get,
  Post,
  Param,
  Res,
} from '@nestjs/common';
import * as appService from './app.service';
import express from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: appService.AppService) {}

  // ############# ENDPOINTS DO HOSPITAL ################
  @Get('allHosp')
  getAllHospitals() {
    return this.appService.listHospitals();
  }

  @Get('hosp:cnes')
  getHospital(@Param('cnes') cnes: string) {
    return this.appService.getHospital(cnes);
  }

  @Post('hosp')
  createHospital(@Body() body: appService.HP_CreationData) {
    return this.appService.createHospital(body);
  }

  @Delete('hosp:cnes')
  deleteHospital(@Param('cnes') cnes: string) {
    return this.appService.deleteHospital(cnes);
  }

  @Get('hospDebug')
  debugHosptials() {
    return this.appService.debugHospitals();
  }

  // ############# ENDPOINTS DO LAUDO ################
  @Get('laudoSiaCsv:id')
  getLaudoSiaCsv(@Param('id') id: string, @Res() res: express.Response) {
    const read_stream = this.appService.streamSiaCsv(+id);

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="SIA.csv"',
    });

    read_stream.pipe(res);
  }

  @Get('laudoSihCsv:id')
  getLaudoSihCsv(@Param('id') id: string, @Res() res: express.Response) {
    const read_stream = this.appService.streamSihCsv(+id);

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="SIH.csv"',
    });

    read_stream.pipe(res);
  }

  @Get('laudoPdf:id')
  async getLaudoPdf(@Param('id') id: string, @Res() res: express.Response) {
    const read_stream = await this.appService.streamPdf(+id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="laudo.pdf"',
    });

    read_stream.pipe(res);
  }

  @Get('laudosHosp:cnes')
  getLaudosFromHosp(@Param('cnes') cnes: string) {
    return this.appService.listLaudosHosp(cnes);
  }

  @Get('laudo:id')
  getLaudo(@Param('id') id: string) {
    return this.appService.getLaudo(+id);
  }

  @Get('allLaudos')
  getAllLaudos() {
    return this.appService.listAllLaudos();
  }

  @Delete('laudo:id')
  deleteLaudo(@Param('id') id: string) {
    return this.appService.deleteLaudo(+id);
  }

  @Post('makeLaudo')
  makeLaudo(@Body() body: appService.LD_CreationData) {
    return this.appService.createLaudo(body);
  }

  @Get('debugLaudo')
  debugLaudo() {
    return this.appService.debugLaudos();
  }
}
