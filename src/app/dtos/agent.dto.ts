import {
    IsString,
} from 'class-validator';

export class AgentDTO {
    @IsString()
    task: string;
    @IsString()
    sessionId: string;
}