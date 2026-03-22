import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, format, parseISO, getDay } from "date-fns";

interface DayData {
  name: string;
  deliveries: number;
  distance: number;
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DeliveryChart = () => {
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["delivery-chart"],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from("dispatches")
        .select("actual_delivery, distance_km")
        .eq("status", "delivered")
        .gte("actual_delivery", format(weekStart, "yyyy-MM-dd"))
        .lte("actual_delivery", format(weekEnd, "yyyy-MM-dd"));

      if (error) throw error;

      // Initialize all days with zero
      const weekData: DayData[] = [
        { name: "Mon", deliveries: 0, distance: 0 },
        { name: "Tue", deliveries: 0, distance: 0 },
        { name: "Wed", deliveries: 0, distance: 0 },
        { name: "Thu", deliveries: 0, distance: 0 },
        { name: "Fri", deliveries: 0, distance: 0 },
        { name: "Sat", deliveries: 0, distance: 0 },
        { name: "Sun", deliveries: 0, distance: 0 },
      ];

      // Aggregate data by day
      (data || []).forEach((dispatch) => {
        if (dispatch.actual_delivery) {
          const dayOfWeek = getDay(parseISO(dispatch.actual_delivery));
          // Convert Sunday (0) to index 6, Monday (1) to index 0, etc.
          const index = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          weekData[index].deliveries += 1;
          weekData[index].distance += dispatch.distance_km || 0;
        }
      });

      return weekData;
    },
  });

  const data = chartData || [
    { name: "Mon", deliveries: 0, distance: 0 },
    { name: "Tue", deliveries: 0, distance: 0 },
    { name: "Wed", deliveries: 0, distance: 0 },
    { name: "Thu", deliveries: 0, distance: 0 },
    { name: "Fri", deliveries: 0, distance: 0 },
    { name: "Sat", deliveries: 0, distance: 0 },
    { name: "Sun", deliveries: 0, distance: 0 },
  ];

  return (
    <div className="glass-card p-5">
      <div className="mb-5">
        <h3 className="font-heading font-semibold text-lg text-foreground">
          Weekly Performance
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Deliveries completed this week
        </p>
      </div>

      <div className="h-72">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading chart data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorDeliveries" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(173, 80%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(173, 80%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  color: "hsl(var(--popover-foreground))",
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                formatter={(value: number, name: string) => [
                  name === "deliveries" ? value : `${value} km`,
                  name === "deliveries" ? "Deliveries" : "Distance",
                ]}
              />
              <Area
                type="monotone"
                dataKey="deliveries"
                stroke="hsl(173, 80%, 45%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorDeliveries)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 mt-5">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-primary" />
          <span className="text-sm text-muted-foreground">Deliveries</span>
        </div>
      </div>
    </div>
  );
};

export default DeliveryChart;
