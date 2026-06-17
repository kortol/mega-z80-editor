	.globl	outchar
	.globl	main
	.module	stmt_call_two_arg_mixed.i
	.area	_CODE
main:
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#67
	ld	hl,#0
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#68
	push	hl
	call	pickfirst
	pop	bc
	pop	bc
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	inc	sp
	ret
pickfirst:
	ld	hl,#4
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	ret
	.area	_BSS
