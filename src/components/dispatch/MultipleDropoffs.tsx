import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, MapPin, ChevronUp, ChevronDown } from "lucide-react";

interface Dropoff {
  id: string;
  address: string;
  notes: string;
  latitude?: number;
  longitude?: number;
}

interface MultipleDropoffsProps {
  dropoffs: Dropoff[];
  onChange: (dropoffs: Dropoff[]) => void;
}

const MultipleDropoffs = ({ dropoffs, onChange }: MultipleDropoffsProps) => {
  const addDropoff = () => {
    onChange([
      ...dropoffs,
      { id: crypto.randomUUID(), address: "", notes: "" },
    ]);
  };

  const removeDropoff = (id: string) => {
    onChange(dropoffs.filter((d) => d.id !== id));
  };

  const updateDropoff = (id: string, field: keyof Dropoff, value: string | number) => {
    onChange(
      dropoffs.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const moveDropoff = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= dropoffs.length) return;
    const newDropoffs = [...dropoffs];
    const [moved] = newDropoffs.splice(fromIndex, 1);
    newDropoffs.splice(toIndex, 0, moved);
    onChange(newDropoffs);
  };

  return (
    <Card className="border-dashed border-border/50 bg-secondary/20">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="text-sm font-heading flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span>Additional Drop-off Points</span>
            {dropoffs.length > 0 && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                {dropoffs.length} stop{dropoffs.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addDropoff} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-1" />
            Add Stop
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        {dropoffs.length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed border-border/30 rounded-lg">
            <MapPin className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No additional stops added
            </p>
            <p className="text-xs text-muted-foreground/70">
              Click "Add Stop" to include multiple drop-off points
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dropoffs.map((dropoff, index) => (
              <div
                key={dropoff.id}
                className="p-3 sm:p-4 bg-background/60 border border-border/30 rounded-lg group hover:border-primary/30 transition-colors"
              >
                {/* Mobile layout */}
                <div className="flex items-center justify-between mb-2 sm:hidden">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{index + 1}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Stop {index + 1}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveDropoff(index, index - 1)}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                    )}
                    {index < dropoffs.length - 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveDropoff(index, index + 1)}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeDropoff(dropoff.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{index + 1}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveDropoff(index, index - 1)}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                      )}
                      {index < dropoffs.length - 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => moveDropoff(index, index + 1)}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Enter drop-off address"
                      value={dropoff.address}
                      onChange={(e) => updateDropoff(dropoff.id, "address", e.target.value)}
                      className="bg-background/80"
                    />
                    <Input
                      placeholder="Notes for this stop (optional)"
                      value={dropoff.notes}
                      onChange={(e) => updateDropoff(dropoff.id, "notes", e.target.value)}
                      className="bg-background/80 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-50 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeDropoff(dropoff.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Mobile inputs */}
                <div className="space-y-2 sm:hidden">
                  <Input
                    placeholder="Enter drop-off address"
                    value={dropoff.address}
                    onChange={(e) => updateDropoff(dropoff.id, "address", e.target.value)}
                    className="bg-background/80"
                  />
                  <Input
                    placeholder="Notes for this stop (optional)"
                    value={dropoff.notes}
                    onChange={(e) => updateDropoff(dropoff.id, "notes", e.target.value)}
                    className="bg-background/80 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {dropoffs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/30">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success" />
                Pickup
              </span>
              <span>→</span>
              {dropoffs.map((_, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Stop {i + 1}
                  {i < dropoffs.length - 1 && <span className="ml-1">→</span>}
                </span>
              ))}
              <span>→</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-warning" />
                Final
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultipleDropoffs;
