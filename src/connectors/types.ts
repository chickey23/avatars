/**
 * Data source connector interfaces.
 * Phase 4: real connectors will implement these; mocks provided for development.
 */

export interface DataSourceConfig {
  id: string;
  enabled: boolean;
  auth?: unknown;
}

export interface EmailItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  location?: string;
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  birthday?: string;
}

export interface WeatherData {
  temp: number;
  condition: string;
  location: string;
  timestamp: number;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url?: string;
  publishedAt: number;
}

export interface IEmailConnector {
  fetchRecent(limit?: number): Promise<EmailItem[]>;
}

export interface ICalendarConnector {
  fetchUpcoming(days?: number): Promise<CalendarEvent[]>;
}

export interface IContactsConnector {
  fetchAll(): Promise<Contact[]>;
}

export interface IWeatherConnector {
  fetchCurrent(location?: string): Promise<WeatherData>;
}

export interface INewsConnector {
  fetchRecent(limit?: number): Promise<NewsItem[]>;
}
