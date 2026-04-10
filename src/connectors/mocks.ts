/**
 * Mock data source connectors for development.
 * Replace with real OAuth/API implementations in production.
 */

import type {
  EmailItem,
  CalendarEvent,
  Contact,
  WeatherData,
  NewsItem,
} from "./types";

export const mockEmailConnector = {
  async fetchRecent(limit = 5): Promise<EmailItem[]> {
    return [
      {
        id: "1",
        from: "team@example.com",
        subject: "Weekly sync",
        snippet: "Reminder: meeting at 3pm",
        date: Date.now() - 3600000,
      },
    ].slice(0, limit);
  },
};

export const mockCalendarConnector = {
  async fetchUpcoming(_days = 7): Promise<CalendarEvent[]> {
    const now = Date.now();
    return [
      {
        id: "c1",
        title: "Team standup",
        start: now + 86400000,
        end: now + 86400000 + 1800000,
      },
    ];
  },
};

export const mockContactsConnector = {
  async fetchAll(): Promise<Contact[]> {
    return [
      { id: "co1", name: "Jane Doe", email: "jane@example.com", birthday: "03-15" },
    ];
  },
};

export const mockWeatherConnector = {
  async fetchCurrent(): Promise<WeatherData> {
    return {
      temp: 72,
      condition: "Partly cloudy",
      location: "Local",
      timestamp: Date.now(),
    };
  },
};

export const mockNewsConnector = {
  async fetchRecent(limit = 5): Promise<NewsItem[]> {
    return [
      {
        id: "n1",
        title: "Sample headline",
        source: "Mock News",
        publishedAt: Date.now() - 7200000,
      },
    ].slice(0, limit);
  },
};
