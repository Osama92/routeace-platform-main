import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface PlaceDetails {
  formattedAddress: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (details: PlaceDetails) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const AddressAutocomplete = ({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing an address...",
  className,
  disabled,
}: AddressAutocompleteProps) => {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length < 3) {
      setPredictions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('google-places-autocomplete', {
          body: { input: value, sessionToken },
        });

        if (error) throw error;
        setPredictions(data.predictions || []);
        setShowDropdown(true);
      } catch (error) {
        console.error('Error fetching predictions:', error);
        setPredictions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, sessionToken]);

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    onChange(prediction.description);
    setShowDropdown(false);
    setPredictions([]);

    if (onPlaceSelect) {
      try {
        const { data, error } = await supabase.functions.invoke('google-places-details', {
          body: { placeId: prediction.placeId, sessionToken },
        });

        if (error) throw error;
        onPlaceSelect(data);
      } catch (error) {
        console.error('Error fetching place details:', error);
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn("pl-10", className)}
          disabled={disabled}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {predictions.map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              onClick={() => handleSelectPlace(prediction)}
              className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-start gap-2"
            >
              <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{prediction.mainText}</p>
                <p className="text-xs text-muted-foreground">{prediction.secondaryText}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
