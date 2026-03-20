-- Add idle_reason to vehicles for tracking why trucks are not dispatched
alter table vehicles add column if not exists idle_reason text;

-- Add vendor_delay_note to dispatches for tagging vendors causing delays
alter table dispatches add column if not exists vendor_delay_note text;
