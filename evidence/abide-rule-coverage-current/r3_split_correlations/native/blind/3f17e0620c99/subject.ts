export interface CaseState {
  /** Room temperature and humidity are independently available measurements; either remains meaningful without the other. */
  displayLabel: string;
  temperatureCelsius?: number;
  humidityPercent?: number;
}
