import { AggregatedResult, Reporter, ReporterOnStartOptions, TestContext } from "@jest/reporters"
import { Config, TestResult } from "@jest/types"
import { MetricServiceClient, protos } from "@google-cloud/monitoring"

type GlobalLabels = Record<string, string>

type Options = {
  projectId?: string
  labels?: GlobalLabels
}

type TimeSeriesOptions = {
  projectId: string
  endTime: number
  globalLabels?: GlobalLabels
}

function makeDurationTimeSeries(r: TestResult.AssertionResult, options: TimeSeriesOptions) {
  const dataPoint: protos.google.monitoring.v3.IPoint = {
    interval: {
      endTime: {
        seconds: options.endTime,
      },
    },
    value: {
      doubleValue: r.duration
    },
  }
  const t: protos.google.monitoring.v3.ITimeSeries = {
    metric: {
      type: 'custom.googleapis.com/jest/duration',
      labels: {
        ...options.globalLabels,
        status: r.status,
        name: r.fullName
      },
    },
    resource: {
      type: 'global',
      labels: {
        project_id: options.projectId,
      },
    },
    points: [dataPoint],
  }
  return t
}

function makeStatusTimeSeries(r: TestResult.AssertionResult, options: TimeSeriesOptions) {
  const dataPoint: protos.google.monitoring.v3.IPoint = {
    interval: {
      endTime: {
        seconds: options.endTime,
      },
    },
    value: {
      int64Value: 1,
    },
  }
  const t: protos.google.monitoring.v3.ITimeSeries = {
    metric: {
      type: 'custom.googleapis.com/jest/status',
      labels: {
        ...options.globalLabels,
        status: r.status,
        name: r.fullName
      },
    },
    resource: {
      type: 'global',
      labels: {
        project_id: options.projectId,
      },
    },
    points: [dataPoint],
  }
  return t
}

function makeTimeSeries(r: AggregatedResult, options: TimeSeriesOptions): protos.google.monitoring.v3.ITimeSeries[] {
  const timeSeries: protos.google.monitoring.v3.ITimeSeries[] = []
  r.testResults.flatMap(r => r.testResults.filter(r => r.status === "passed" || r.status === "failed")).forEach(r => {
    timeSeries.push(makeDurationTimeSeries(r, options))
    timeSeries.push(makeStatusTimeSeries(r, options))
  })
  return timeSeries
}

export default class MetricsReporter implements Reporter {
  client: MetricServiceClient
  options: Options
  constructor(globalConfig: Config.GlobalConfig, options: Options) {
    this.options = options
    options.projectId = options.projectId || process.env["GCP_PROJECT"]
    this.client = new MetricServiceClient({
      projectId: options.projectId
    })
  }

  onRunStart(results: AggregatedResult, options: ReporterOnStartOptions): void | Promise<void> {}
  async onRunComplete(testContexts: Set<TestContext>, results: AggregatedResult): Promise<void> {
    const endTime = Date.now() / 1000
    const timeSeries = makeTimeSeries(results, {
      endTime,
      projectId: this.options.projectId || "",
      globalLabels: this.options.labels
    })
    const request: protos.google.monitoring.v3.ICreateTimeSeriesRequest = {
      name: this.options.projectId ? this.client.projectPath(this.options.projectId) : null,
      timeSeries
    }
    await this.client.createTimeSeries(request)
  }
  getLastError(): void | Error {
  }
}