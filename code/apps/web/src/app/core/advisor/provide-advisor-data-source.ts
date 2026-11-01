import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AdvisorDataSource } from './advisor-data-source';
import { ApiDataSource } from './api/api-data-source';

/** Binds `AdvisorDataSource` to the case backend. */
export function provideAdvisorDataSource(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: AdvisorDataSource, useFactory: () => new ApiDataSource() }]);
}
