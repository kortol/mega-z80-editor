	.globl	outchar
	.globl	main
	.module	stmt_local_int.i
	.area	_CODE
main:
	dec	sp
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#90
	inc	hl
	ld	(hl),#0
	ld	hl,#0
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	inc	sp
	inc	sp
	ret
	.area	_BSS
