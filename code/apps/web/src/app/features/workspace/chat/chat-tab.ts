import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-chat-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Chat</h1>`,
})
export class ChatTab {}
