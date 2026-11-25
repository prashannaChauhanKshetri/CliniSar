/**
 * One lab value over time (e.g. Random Blood Sugar), with the normal range as two
 * dashed lines. Loaded only when a history panel shows a trend, so the chart library
 * never slows down other screens.
 *
 * NP: Euta lab value ko graph. Duita dashed line = normal range ko tala ra mathi.
 *     Dot tyo line bhanda bahira cha bhane abnormal.
 */
import { LineChart } from '@mantine/charts'
import { formatBSNumeric } from '../../lib/date'
import { chartDomain, parseRange } from '../../lib/history'
import type { PatientHistory } from '../../api/resources'

type Trend = PatientHistory['lab_trends'][number]

export default function LabTrendChart({ trend }: { trend: Trend }) {
  const range = parseRange(trend.reference_range)
  const data = trend.points.map((point) => ({
    // "2083/08/03" -> "08/03": short enough for a phone screen
    date: point.date ? formatBSNumeric(point.date).slice(5) : '',
    value: point.value,
  }))
  return (
    <LineChart
      h={140}
      data={data}
      dataKey="date"
      series={[{ name: 'value', label: trend.unit || trend.name, color: 'primary.6' }]}
      curveType="linear"
      withDots
      gridAxis="y"
      tickLine="none"
      // The scale always includes the normal range, so the dashed lines are visible and
      // the doctor sees HOW FAR outside normal the values are.
      yAxisProps={{
        width: 44,
        domain: chartDomain(
          data.map((point) => point.value),
          range,
        ),
      }}
      referenceLines={
        range
          ? [
              { y: range.low, color: 'grey.5', strokeDasharray: '4 4' },
              { y: range.high, color: 'grey.5', strokeDasharray: '4 4' },
            ]
          : []
      }
    />
  )
}
