; Single arena, non-reentrant allocator. Sizes include the 4-byte header.
; Header: size|allocated (word), next-free absolute address (word).
; Free list is rebuilt in address order after each mutation.
mz80_heap_init:
	ld hl,#0
	ld (mz80_heap_base),hl
	ld (mz80_heap_head),hl
	ld (mz80_heap_end),hl
	ld hl,#2
	add hl,sp
	call .gint
	bit 7,h
	jp nz,mz80_heap_fail
	ld (mz80_heap_size),hl
	ld hl,#4
	add hl,sp
	call .gint
	ld a,h
	or l
	jp z,mz80_heap_fail
	bit 0,l
	jp z,mz80_heap_init_aligned
	inc hl
	ld a,h
	or l
	jp z,mz80_heap_fail
	ex de,hl
	ld hl,(mz80_heap_size)
	ld a,h
	or l
	jp z,mz80_heap_fail
	dec hl
	ld (mz80_heap_size),hl
	ex de,hl
mz80_heap_init_aligned:
	ld (mz80_heap_cur),hl
	ld hl,(mz80_heap_size)
	res 0,l
	ld (mz80_heap_size),hl
	ld de,#6
	or a
	sbc hl,de
	jp c,mz80_heap_fail
	ld hl,(mz80_heap_cur)
	ld de,(mz80_heap_size)
	add hl,de
	jp c,mz80_heap_fail
	ld a,h
	or l
	jp z,mz80_heap_fail
	ld (mz80_heap_end),hl
	ld hl,(mz80_heap_cur)
	ld (mz80_heap_base),hl
	ld (mz80_heap_head),hl
	ld de,(mz80_heap_size)
	ld (hl),e
	inc hl
	ld (hl),d
	inc hl
	ld (hl),#0
	inc hl
	ld (hl),#0
	ld hl,#1
	ret

malloc:
	call mz80_heap_guard
	ld hl,#2
	add hl,sp
	call .gint
	bit 7,h
	jp nz,mz80_heap_fail
	ld a,h
	or l
	jp z,mz80_heap_fail
	inc hl
	res 0,l
	ld de,#4
	add hl,de
	bit 7,h
	jp nz,mz80_heap_fail
	ld (mz80_heap_request),hl
	ld hl,(mz80_heap_head)
mz80_heap_find:
	ld a,h
	or l
	jp z,mz80_heap_fail
	ld (mz80_heap_cur),hl
	call .gint
	ld (mz80_heap_size),hl
	ld de,(mz80_heap_request)
	or a
	sbc hl,de
	jp nc,mz80_heap_found
	ld hl,(mz80_heap_cur)
	inc hl
	inc hl
	call .gint
	jp mz80_heap_find
mz80_heap_found:
	ld de,#6
	or a
	sbc hl,de
	jp c,mz80_heap_whole
	ld hl,(mz80_heap_size)
	ld de,(mz80_heap_request)
	or a
	sbc hl,de
	push hl
	ld hl,(mz80_heap_cur)
	add hl,de
	pop de
	ld (hl),e
	inc hl
	ld (hl),d
	inc hl
	ld (hl),#0
	inc hl
	ld (hl),#0
	ld hl,(mz80_heap_request)
	ld (mz80_heap_size),hl
mz80_heap_whole:
	ld de,(mz80_heap_size)
	set 0,e
	ld hl,(mz80_heap_cur)
	ld (hl),e
	inc hl
	ld (hl),d
	ld hl,(mz80_heap_cur)
	ld de,#4
	add hl,de
	push hl
	call mz80_heap_rebuild
	pop hl
	ret

free:
	call mz80_heap_guard
	ld hl,#2
	add hl,sp
	call .gint
	ld a,h
	or l
	ret z
	ld a,(mz80_heap_debug)
	or a
	jp z,mz80_heap_free_valid
	push hl
	call mz80_heap_valid_pointer
	ld a,h
	or l
	pop hl
	jp z,mz80_heap_panic
mz80_heap_free_valid:
	ld de,#4
	or a
	sbc hl,de
	res 0,(hl)
	ld hl,(mz80_heap_base)
mz80_heap_coalesce:
	ld (mz80_heap_cur),hl
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	jp nc,mz80_heap_rebuild
	ld hl,(mz80_heap_cur)
	ld a,(hl)
	and #1
	ld (mz80_heap_allocated),a
	call mz80_heap_read_size
	ld (mz80_heap_size),hl
	ex de,hl
	ld hl,(mz80_heap_cur)
	add hl,de
	ld (mz80_heap_next),hl
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	jp nc,mz80_heap_rebuild
	ld a,(mz80_heap_allocated)
	or a
	jp nz,mz80_heap_coalesce_next
	ld hl,(mz80_heap_next)
	bit 0,(hl)
	jp nz,mz80_heap_coalesce_next
	call mz80_heap_read_size
	ld de,(mz80_heap_size)
	add hl,de
	ex de,hl
	ld hl,(mz80_heap_cur)
	ld (hl),e
	inc hl
	ld (hl),d
	ld hl,(mz80_heap_cur)
	jp mz80_heap_coalesce
mz80_heap_coalesce_next:
	ld hl,(mz80_heap_next)
	jp mz80_heap_coalesce

mz80_heap_rebuild:
	ld hl,#0
	ld (mz80_heap_head),hl
	ld (mz80_heap_previous),hl
	ld hl,(mz80_heap_base)
mz80_heap_rebuild_loop:
	ld a,h
	or l
	ret z
	ld (mz80_heap_cur),hl
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	ret nc
	ld hl,(mz80_heap_cur)
	bit 0,(hl)
	jp nz,mz80_heap_rebuild_next
	ld hl,(mz80_heap_previous)
	ld a,h
	or l
	jp z,mz80_heap_rebuild_head
	inc hl
	inc hl
	ld de,(mz80_heap_cur)
	ld (hl),e
	inc hl
	ld (hl),d
	jp mz80_heap_rebuild_tail
mz80_heap_rebuild_head:
	ld hl,(mz80_heap_cur)
	ld (mz80_heap_head),hl
mz80_heap_rebuild_tail:
	ld hl,(mz80_heap_cur)
	ld (mz80_heap_previous),hl
	inc hl
	inc hl
	ld (hl),#0
	inc hl
	ld (hl),#0
mz80_heap_rebuild_next:
	ld hl,(mz80_heap_cur)
	call mz80_heap_read_size
	ld de,(mz80_heap_cur)
	add hl,de
	jp mz80_heap_rebuild_loop

mz80_heap_read_size:
	call .gint
	res 0,l
	ret
mz80_heap_fail:
	ld hl,#0
	ret

; calloc(count, bytes): 15-bit positive product checked while multiplying.
calloc:
	ld hl,#4
	add hl,sp
	call .gint
	bit 7,h
	jp nz,mz80_heap_fail
	ld a,h
	or l
	jp z,mz80_heap_fail
	ld b,h
	ld c,l
	ld hl,#2
	add hl,sp
	call .gint
	bit 7,h
	jp nz,mz80_heap_fail
	ld a,h
	or l
	jp z,mz80_heap_fail
	ex de,hl
	ld hl,#0
mz80_heap_multiply:
	bit 0,c
	jp z,mz80_heap_multiply_shift
	add hl,de
	jp c,mz80_heap_fail
	bit 7,h
	jp nz,mz80_heap_fail
mz80_heap_multiply_shift:
	srl b
	rr c
	ld a,b
	or c
	jp z,mz80_heap_calloc_alloc
	sla e
	rl d
	jp c,mz80_heap_fail
	bit 7,d
	jp nz,mz80_heap_fail
	jp mz80_heap_multiply
mz80_heap_calloc_alloc:
	push hl
	push hl
	call malloc
	pop bc
	pop bc
	ld a,h
	or l
	ret z
	push hl
mz80_heap_zero:
	ld (hl),#0
	inc hl
	dec bc
	ld a,b
	or c
	jp nz,mz80_heap_zero
	pop hl
	ret

realloc:
	call mz80_heap_guard
	ld hl,#4
	add hl,sp
	call .gint
	ld (mz80_heap_realloc_old),hl
	ld a,h
	or l
	jp z,malloc
	ld hl,#2
	add hl,sp
	call .gint
	ld (mz80_heap_realloc_bytes),hl
	ld a,h
	or l
	jp nz,mz80_heap_realloc_size
	ld hl,(mz80_heap_realloc_old)
	push hl
	call free
	pop bc
	jp mz80_heap_fail
mz80_heap_realloc_size:
	bit 7,h
	jp nz,mz80_heap_fail
	inc hl
	res 0,l
	ld de,#4
	add hl,de
	bit 7,h
	jp nz,mz80_heap_fail
	ld (mz80_heap_realloc_total),hl
	ld hl,(mz80_heap_realloc_old)
	call mz80_heap_valid_pointer
	ld a,h
	or l
	jp nz,mz80_heap_realloc_valid
	ld a,(mz80_heap_debug)
	or a
	jp nz,mz80_heap_panic
	jp mz80_heap_fail
mz80_heap_realloc_valid:
	ld hl,(mz80_heap_realloc_old)
	ld de,#4
	or a
	sbc hl,de
	ld (mz80_heap_realloc_header),hl
	call mz80_heap_read_size
	ld (mz80_heap_realloc_capacity),hl
	ld de,(mz80_heap_realloc_total)
	or a
	sbc hl,de
	jp nc,mz80_heap_realloc_resize
	ld hl,(mz80_heap_realloc_header)
	ld de,(mz80_heap_realloc_capacity)
	add hl,de
	ld (mz80_heap_realloc_adjacent),hl
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	jp nc,mz80_heap_realloc_move
	ld hl,(mz80_heap_realloc_adjacent)
	bit 0,(hl)
	jp nz,mz80_heap_realloc_move
	call mz80_heap_read_size
	ld de,(mz80_heap_realloc_capacity)
	add hl,de
	ld (mz80_heap_realloc_combined),hl
	ld de,(mz80_heap_realloc_total)
	or a
	sbc hl,de
	jp c,mz80_heap_realloc_move
	ld hl,(mz80_heap_realloc_combined)
	ld (mz80_heap_realloc_capacity),hl
	set 0,l
	ex de,hl
	ld hl,(mz80_heap_realloc_header)
	ld (hl),e
	inc hl
	ld (hl),d
	call mz80_heap_rebuild
mz80_heap_realloc_resize:
	ld hl,(mz80_heap_realloc_capacity)
	ld de,(mz80_heap_realloc_total)
	or a
	sbc hl,de
	ld bc,#6
	or a
	sbc hl,bc
	jp c,mz80_heap_realloc_same
	add hl,bc
	set 0,l
	push hl
	ld hl,(mz80_heap_realloc_header)
	add hl,de
	pop bc
	ld (hl),c
	inc hl
	ld (hl),b
	inc hl
	ld (hl),#0
	inc hl
	ld (hl),#0
	inc hl
	push hl
	ld hl,(mz80_heap_realloc_header)
	set 0,e
	ld (hl),e
	inc hl
	ld (hl),d
	call free
	pop bc
mz80_heap_realloc_same:
	ld hl,(mz80_heap_realloc_old)
	ret
mz80_heap_realloc_move:
	ld hl,(mz80_heap_realloc_bytes)
	push hl
	call malloc
	pop bc
	ld a,h
	or l
	ret z
	ld (mz80_heap_realloc_new),hl
	ex de,hl
	ld hl,(mz80_heap_realloc_capacity)
	ld bc,#4
	or a
	sbc hl,bc
	ld b,h
	ld c,l
	ld hl,(mz80_heap_realloc_old)
	ldir
	ld hl,(mz80_heap_realloc_old)
	push hl
	call free
	pop bc
	ld hl,(mz80_heap_realloc_new)
	ret

mz80_heap_set_debug:
	ld hl,#2
	add hl,sp
	call .gint
	ld a,h
	or l
	ld (mz80_heap_debug),a
	ret

; Read-only validation. Never follow a free-list pointer: instead compare it
; against the bounded physical walk, validating the full header before reading.
mz80_heap_check:
	ld hl,(mz80_heap_base)
	ld a,h
	or l
	jp z,mz80_heap_fail
	bit 0,l
	jp nz,mz80_heap_fail
	ld (mz80_heap_check_cur),hl
	ld hl,(mz80_heap_head)
	ld (mz80_heap_check_expected),hl
mz80_heap_check_loop:
	ld hl,(mz80_heap_check_cur)
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	jp z,mz80_heap_check_end
	jp nc,mz80_heap_fail
	ld hl,(mz80_heap_end)
	ld de,(mz80_heap_check_cur)
	or a
	sbc hl,de
	ld de,#6
	or a
	sbc hl,de
	jp c,mz80_heap_fail
	ld hl,(mz80_heap_check_cur)
	ld a,(hl)
	and #1
	ld (mz80_heap_check_allocated),a
	call mz80_heap_read_size
	bit 7,h
	jp nz,mz80_heap_fail
	ld (mz80_heap_check_size),hl
	ld de,#6
	or a
	sbc hl,de
	jp c,mz80_heap_fail
	ld hl,(mz80_heap_check_cur)
	ld de,(mz80_heap_check_size)
	add hl,de
	jp c,mz80_heap_fail
	ld (mz80_heap_check_next),hl
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	jp c,mz80_heap_check_bounds_ok
	jp nz,mz80_heap_fail
mz80_heap_check_bounds_ok:
	ld a,(mz80_heap_check_allocated)
	or a
	jp nz,mz80_heap_check_advance
	ld hl,(mz80_heap_check_expected)
	ld de,(mz80_heap_check_cur)
	or a
	sbc hl,de
	jp nz,mz80_heap_fail
	ld hl,(mz80_heap_check_cur)
	inc hl
	inc hl
	call .gint
	ld (mz80_heap_check_expected),hl
mz80_heap_check_advance:
	ld hl,(mz80_heap_check_next)
	ld (mz80_heap_check_cur),hl
	jp mz80_heap_check_loop
mz80_heap_check_end:
	ld hl,(mz80_heap_check_expected)
	ld a,h
	or l
	jp nz,mz80_heap_fail
	ld hl,#1
	ret

; HL payload -> 1 for the exact start of a live allocation, otherwise 0.
; Called only after heap validation in debug mode (valid metadata in release).
mz80_heap_valid_pointer:
	ld (mz80_heap_check_pointer),hl
	ld hl,(mz80_heap_base)
mz80_heap_pointer_loop:
	ld a,h
	or l
	jp z,mz80_heap_fail
	ld (mz80_heap_check_cur),hl
	ld de,(mz80_heap_end)
	or a
	sbc hl,de
	jp nc,mz80_heap_fail
	ld hl,(mz80_heap_check_cur)
	ld de,#4
	add hl,de
	ld de,(mz80_heap_check_pointer)
	or a
	sbc hl,de
	jp z,mz80_heap_pointer_found
	ld hl,(mz80_heap_check_cur)
	call mz80_heap_read_size
	ld de,(mz80_heap_check_cur)
	add hl,de
	jp mz80_heap_pointer_loop
mz80_heap_pointer_found:
	ld hl,(mz80_heap_check_cur)
	bit 0,(hl)
	jp z,mz80_heap_fail
	ld hl,#1
	ret
mz80_heap_guard:
	ld a,(mz80_heap_debug)
	or a
	ret z
	ld hl,(mz80_heap_base)
	ld a,h
	or l
	ret z
	call mz80_heap_check
	ld a,h
	or l
	ret nz
mz80_heap_panic:
	ld hl,#1
	push hl
	call exit
	pop bc
	; A returning custom exit hook must not resume a corrupted heap operation.
mz80_heap_panic_halt:
	halt
	jp mz80_heap_panic_halt

; Explicit initialized DATA: correctness does not require BSS clearing.
	.area _DATA
mz80_heap_base:
	.dw 0
mz80_heap_end:
	.dw 0
mz80_heap_head:
	.dw 0
mz80_heap_cur:
	.dw 0
mz80_heap_next:
	.dw 0
mz80_heap_previous:
	.dw 0
mz80_heap_size:
	.dw 0
mz80_heap_request:
	.dw 0
mz80_heap_allocated:
	.db 0
mz80_heap_debug:
	.db 0
mz80_heap_realloc_old:
	.dw 0
mz80_heap_realloc_bytes:
	.dw 0
mz80_heap_realloc_total:
	.dw 0
mz80_heap_realloc_header:
	.dw 0
mz80_heap_realloc_capacity:
	.dw 0
mz80_heap_realloc_adjacent:
	.dw 0
mz80_heap_realloc_combined:
	.dw 0
mz80_heap_realloc_new:
	.dw 0
mz80_heap_check_cur:
	.dw 0
mz80_heap_check_next:
	.dw 0
mz80_heap_check_size:
	.dw 0
mz80_heap_check_expected:
	.dw 0
mz80_heap_check_pointer:
	.dw 0
mz80_heap_check_allocated:
	.db 0
