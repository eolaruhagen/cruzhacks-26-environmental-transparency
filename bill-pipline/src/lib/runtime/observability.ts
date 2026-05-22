import { DiscordSink, ObservabilityProvider } from "@cruzhacks/shared";

export function makeObservability(name: string): ObservabilityProvider {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    return new ObservabilityProvider(
        webhookUrl ? [new DiscordSink({ webhookUrl, username: name })] : [],
    );
}
