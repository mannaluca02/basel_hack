import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { AdvisorDataSource } from './advisor-data-source';
import { ApiDataSource } from './api/api-data-source';
import { MockDataSource } from './mock/mock-data-source';

/**
 * Binds `AdvisorDataSource` to the implementation named by `dataSource` in the environment,
 * the one config value that switches between mock and real backend.
 */
export function provideAdvisorDataSource(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: AdvisorDataSource,
      useFactory: (): AdvisorDataSource => {
        const mode = inject(APP_ENVIRONMENT).dataSource;
        switch (mode) {
          case 'mock':
            return new MockDataSource();
          case 'api':
            return new ApiDataSource();
        }
      },
    },
  ]);
}
