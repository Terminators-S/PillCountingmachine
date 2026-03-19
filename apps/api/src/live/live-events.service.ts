import { Injectable } from '@nestjs/common';
import { Observable, Subject, merge, interval, map } from 'rxjs';

export interface LiveMessage {
  type: string;
  payload: Record<string, unknown>;
  emittedAt: string;
}

@Injectable()
export class LiveEventsService {
  private readonly stream$ = new Subject<LiveMessage>();

  publish(type: string, payload: Record<string, unknown>) {
    this.stream$.next({
      type,
      payload,
      emittedAt: new Date().toISOString()
    });
  }

  asObservable(): Observable<LiveMessage> {
    return merge(
      this.stream$.asObservable(),
      interval(15000).pipe(
        map(() => ({
          type: 'heartbeat',
          payload: { status: 'ok' },
          emittedAt: new Date().toISOString()
        }))
      )
    );
  }
}
