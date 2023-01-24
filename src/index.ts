import { AggregatedResult, Reporter, ReporterOnStartOptions, TestContext } from "@jest/reporters"
import { Config } from "@jest/types"
import { MetricServiceClient, protos } from "@google-cloud/monitoring"

type Options = {
  projectId?: string
  labels?: Record<string, string>
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
    for (const testResults of results.testResults) {
      for (const testResult of testResults.testResults) {
        const dataPoint: protos.google.monitoring.v3.IPoint = {
          interval: {
            endTime: {
              seconds: endTime,
            },
          },
          value: {
            doubleValue: testResult.duration
          },
        }
        const timeSeries: protos.google.monitoring.v3.ITimeSeries = {
          metric: {
            type: 'custom.googleapis.com/jest/duration',
            labels: {
              ...this.options.labels,
              name: testResult.title
            },
          },
          resource: {
            type: 'global',
            labels: {
              project_id: this.options.projectId || "",
            },
          },
          points: [dataPoint],
        }
        const request: protos.google.monitoring.v3.ICreateTimeSeriesRequest = {
          name: this.options.projectId ? this.client.projectPath(this.options.projectId) : null,
          timeSeries: [timeSeries]
        }
        await this.client.createTimeSeries(request)
      }
    }
  }
  getLastError(): void | Error {
  }
}