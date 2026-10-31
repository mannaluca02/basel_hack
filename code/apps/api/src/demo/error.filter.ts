import { ArgumentsHost,Catch,HttpException,type ExceptionFilter } from '@nestjs/common';

@Catch()
export class SafeDemoErrorFilter implements ExceptionFilter {
  catch(exception:unknown,host:ArgumentsHost) {
    const response=host.switchToHttp().getResponse();
    const status=exception instanceof HttpException?exception.getStatus():500;
    const codes:Record<number,string>={400:'INVALID_INPUT',404:'NOT_FOUND',413:'PAYLOAD_TOO_LARGE'};
    // Parser/provider errors can include original payloads. Return only controlled codes and field paths.
    const details=exception instanceof HttpException?exception.getResponse():null;
    const fields=details && typeof details==='object' && 'fields' in details && Array.isArray(details.fields)
      ? details.fields.filter((s:unknown)=>typeof s==='string'&&s.length<=200).slice(0,10):undefined;
    response.status(status).json({code:codes[status]??'INTERNAL_ERROR',...(fields?{fields}:{})});
  }
}
