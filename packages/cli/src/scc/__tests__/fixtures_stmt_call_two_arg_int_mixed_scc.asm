	.globl	outchar
	.globl	main
	.module	stmt_call_two_arg_int_mixed.i
	.area	_CODE
main:
	dec	sp
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#83
	inc	hl
	ld	(hl),#0
	ld	hl,#0
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	push	hl
	ld	hl,#84
	push	hl
	call	pickfirst16
	pop	bc
	pop	bc
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	inc	sp
	inc	sp
	ret
pickfirst16:
	ld	hl,#4
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
	.area	_BSS
