import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Patch,
  Delete,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestService } from './ingest.service';
import { Roles } from '../auth/roles.decorator';
import * as Papa from 'papaparse';

@Controller('ingest')
@Roles('admin')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Get('columns')
  getColumns() {
    return this.ingest.getAllowedColumns();
  }

  @Post('headers')
  @UseInterceptors(FileInterceptor('file'))
  async getCsvHeaders(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('CSV file is required');
    const text = file.buffer.toString('utf8');
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    if (parsed.errors?.length) {
      throw new BadRequestException(`CSV parse error: ${parsed.errors[0]?.message}`);
    }
    const headers = parsed.meta.fields || [];
    return { headers };
  }

  @Post('csv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body('columnMap') columnMapRaw: string,
    @Body('vendorId') vendorId?: string,
    @Body('source') source?: string,
  ) {
    if (!file) throw new BadRequestException('CSV file is required');
    if (!columnMapRaw) throw new BadRequestException('columnMap is required');

    let columnMap: Record<string, string>;
    try {
      columnMap = JSON.parse(columnMapRaw);
    } catch {
      throw new BadRequestException('columnMap must be a valid JSON object');
    }
    if (typeof columnMap !== 'object' || Array.isArray(columnMap)) {
      throw new BadRequestException('columnMap must be an object');
    }

    return this.ingest.ingestCsv(
      file.buffer,
      columnMap,
      { source: source || 'csv', vendorId },
    );
  }

  @Post('stage')
  async stageEnrichedRows(
    @Body() body: { rows: Record<string, any>[]; calculateMargin?: boolean },
  ) {
    if (!body.rows || !Array.isArray(body.rows)) {
      throw new BadRequestException('Missing or invalid "rows" array');
    }
    return this.ingest.stageEnrichedRows(body.rows);
  }

  @Post('pdf/extract')
  @UseInterceptors(FileInterceptor('file'))
  async extractFromPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('PDF file is required');
    throw new BadRequestException('PDF extraction not implemented yet');
  }

  @Get('batches')
  async getOpenBatches() {
    return this.ingest.getOpenBatches();
  }

  @Get('batches/:batchId/rows')
  async getRows(@Param('batchId') batchId: string) {
    return this.ingest.getRows(batchId);
  }

  @Patch('rows/:rowId/status')
  async updateRowStatus(
    @Param('rowId') rowId: string,
    @Body() body: { status: string; resolution?: string | null },
  ) {
    if (!body.status) throw new BadRequestException('Status is required');
    await this.ingest.updateRowStatus(rowId, body.status, body.resolution);
    return { success: true };
  }

  @Patch('rows/:rowId/mapped')
  async updateMappedData(
    @Param('rowId') rowId: string,
    @Body('mappedData') mappedData: any,
  ) {
    if (!mappedData || typeof mappedData !== 'object') {
      throw new BadRequestException('Invalid mappedData object');
    }
    await this.ingest.updateMappedData(rowId, mappedData);
    return { success: true };
  }

  @Post('batches/:batchId/commit')
  async commitBatch(
    @Param('batchId') batchId: string,
    @Req() req: any,
  ) {
    await this.ingest.commitBatch(batchId, req.user.id);
    return { success: true };
  }

  @Delete('batches/:batchId')
  async deleteBatch(@Param('batchId') batchId: string) {
    await this.ingest.deleteBatch(batchId);
    return { success: true };
  }
}