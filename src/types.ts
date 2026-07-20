export interface FeedItem {
  id: string
  src: string
  w: number
  h: number
  permalink?: string
  ts?: string
}

export interface Feed {
  generated: string
  items: FeedItem[]
}

export interface Placement {
  item: FeedItem
  x: number
  y: number
  w: number
  h: number
}
