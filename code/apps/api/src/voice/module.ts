import { Body, Controller, Get, Post, Param, Query, Req, Inject, Module, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { LIFE_RUNTIME, type LifeRuntime } from '../insurance/runtime.js';
import { LifeSessionGuard } from '../insurance/http.js';
import type { Actor } from '../insurance/types.js';
import { WorkflowError } from '../insurance/types.js';
import { VoiceLabController } from './lab.js';
import { voicePromptSettings } from './prompt.js';
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
    @Get('privacy')
    privacy(
    @Query('locale')
    selected: unknown) { return this.r.voice.privacy(selected === undefined ? 'de' : z.enum(['de', 'fr', 'it', 'en']).parse(selected)); }
    @Get('settings')
    settings() { return voicePromptSettings(); }
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
@Controller('api/cases/:caseId/voice/agent-observations')
@UseGuards(LifeSessionGuard)
class ExternalVoiceController {
    constructor(
    @Inject(LIFE_RUNTIME)
    private readonly r: LifeRuntime) { }
    @Post()
    observations(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Body()
    body: unknown) { return this.r.voice.proposeExternal(req.actor, uuid(id), body); }
}
@Controller('api/cases/:caseId/voice/agent-turns')
@UseGuards(LifeSessionGuard)
class AgentTurnsController {
    constructor(
    @Inject(LIFE_RUNTIME)
    private readonly r: LifeRuntime) { }
    @Get()
    list(
    @Req()
    req: Request,
    @Param('caseId')
    id: string) { return this.r.voice.agentTurns(req.actor, uuid(id)); }
    @Post()
    record(
    @Req()
    req: Request,
    @Param('caseId')
    id: string,
    @Body()
    body: unknown) { return this.r.voice.recordAgentTurns(req.actor, uuid(id), body); }
}
@Controller('api/cases/:caseId/voice/agent-recommendation')
@UseGuards(LifeSessionGuard)
class AgentRecommendationController {
    constructor(
    @Inject(LIFE_RUNTIME)
    private readonly r: LifeRuntime) { }
    @Get()
    read(
    @Req()
    req: Request,
    @Param('caseId')
    id: string) { return this.r.voice.agentRecommendation(req.actor, uuid(id)); }
}
@Module({ controllers: [PublicVoiceController, CaseVoiceController, ExternalVoiceController, AgentTurnsController, AgentRecommendationController, VoiceLabController] })
export class VoiceModule {
}
