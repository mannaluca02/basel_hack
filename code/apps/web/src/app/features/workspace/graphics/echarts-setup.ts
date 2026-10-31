import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

/**
 * The parts of ECharts the Graphics tab uses, registered once. Loaded through a dynamic import
 * from the graphics route, so ECharts stays out of the initial bundle. The legend and the
 * life-event timeline are HTML in the card, not ECharts. MarkLine draws reference lines (needed
 * income, 3a payout). SVG instead of canvas: sharp on phones, lighter in memory.
 */
use([BarChart, LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

export { init } from 'echarts/core';
