export interface Building {
  id: number
  name: string
  address: string
  pickupPoint: string
  serviceHours: string
  createdAt: string
}

export interface BuildingPayload {
  name: string
  address: string
  pickupPoint: string
  serviceHours: string
}
