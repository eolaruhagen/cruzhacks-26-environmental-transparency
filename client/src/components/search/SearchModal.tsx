'use client'

import { useState, useCallback } from "react"


interface SearchModalFilter {
    key: string,
    values: string[]
    // maybe add a type here, but for now its a discrete set of values
}

export interface SearchModalProps<T> {
    filters: SearchModalFilter[]
    queryFn: (filters: SearchModalFilter[]) => Promise<T[]>
    // this is a callback thats provided by the parent to allow for quick updating of results
    setResults: (results: T[]) => void
}

export function SearchModal<T>({ filters, queryFn, setResults }: SearchModalProps<T>) {
}