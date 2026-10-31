import { bootstrapApplication } from '@angular/platform-browser';
import { DebuggingApp } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(DebuggingApp, appConfig).catch(error => console.error(error));
