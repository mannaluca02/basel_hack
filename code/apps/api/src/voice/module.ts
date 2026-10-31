import { Body, Controller, Get, Post, Param, Query, Req, Inject, Module, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { LIFE_RUNTIME, type LifeRuntime } from '../insurance/runtime.js';
import { LifeSessionGuard } from '../insurance/http.js';
import type { Actor } from '../insurance/types.js';
import { WorkflowError } from '../insurance/types.js';
type Request = {
    actor: Actor;
};
const uuid = (value: string) => { if (!z.uuid().safeParse(value).success)
    throw new WorkflowError('NOT_FOUND', 404); return value; };
@Controller('api/voice')
class PublicVoiceController {
    constructor(
    @Inject(LIFE_RUNTIME)
    private readonly r: LifeRuntime) { }
    @Get('providers')
    providers() { return this.r.voice.providers(); }
    @Get('privacy')
    privacy(
    @Query('locale')
    selected: unknown) { return this.r.voice.privacy(selected === undefined ? 'de' : z.enum(['de', 'fr', 'it', 'en']).parse(selected)); }
    @Get('portfolio')
    catalog() { return this.r.voice.catalog(); }
}
@Controller('api/cases/:caseId/voice/sessions')
@UseGuards(LifeSessionGuard)
class CaseVoiceController {
    constructor(
    @Inject(LIFE_RUNTIME)
    private readonly r: LifeRuntime) { }
    @Get()
    list(
    @Req()
    req: Request,
    @Param('caseId')
    id: string) { return this.r.voice.list(req.actor, uuid(id)); }
    @Post()
    start(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Body()
    body: unknown) { return this.r.voice.start(req.actor, uuid(id), body); }
    @Get(':voiceSessionId/transcript')
    transcript(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Param('voiceSessionId')
    sid: string) { return this.r.voice.transcript(req.actor, uuid(id), uuid(sid)); }
    @Post(':voiceSessionId/turns')
    turn(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Param('voiceSessionId')
    sid: string,
    @Body()
    body: unknown) { return this.r.voice.ingest(req.actor, uuid(id), uuid(sid), body); }
    @Post(':voiceSessionId/extraction')
    extraction(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Param('voiceSessionId')
    sid: string,
    @Body()
    body: unknown) { return this.r.voice.propose(req.actor, uuid(id), uuid(sid), body); }
    @Post(':voiceSessionId/close')
    close(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Param('voiceSessionId')
    sid: string,
    @Body()
    body: unknown) { return this.r.voice.close(req.actor, uuid(id), uuid(sid), body); }
}
@Module({ controllers: [PublicVoiceController, CaseVoiceController] })
export class VoiceModule {
}
