import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  AdjustStockDto,
  CycleCountDto,
  DispenseStockDto,
  InventoryBalanceQueryDto,
  InventoryMovementQueryDto,
  ReceiveStockDto,
  ReleaseStockDto,
  ReserveStockDto,
  TransferStockDto
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('receive')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  receive(@Body() input: ReceiveStockDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.receiveStock(input, userId);
  }

  @Post('transfer')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  transfer(@Body() input: TransferStockDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.transferStock(input, userId);
  }

  @Post('adjust')
  @Roles('ADMIN', 'SUPERVISOR')
  adjust(@Body() input: AdjustStockDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.adjustStock(input, userId);
  }

  @Post('reserve')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  reserve(@Body() input: ReserveStockDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.reserveStock(input, userId);
  }

  @Post('release')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  release(@Body() input: ReleaseStockDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.releaseStock(input, userId);
  }

  @Post('dispense')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  dispense(@Body() input: DispenseStockDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.dispenseStock(input, userId);
  }

  @Post('cycle-count')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  cycleCount(@Body() input: CycleCountDto, @CurrentUser('sub') userId: string) {
    return this.inventoryService.cycleCount(input, userId);
  }

  @Get('balances')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  balances(@Query() query: InventoryBalanceQueryDto) {
    return this.inventoryService.balances(query);
  }

  @Get('movements')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR', 'AUDITOR', 'VIEWER')
  movements(@Query() query: InventoryMovementQueryDto) {
    return this.inventoryService.movements(query);
  }
}
