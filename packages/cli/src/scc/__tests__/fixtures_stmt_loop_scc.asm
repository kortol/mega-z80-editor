	.globl	.gt
	.globl	outchar
	.globl	main
	.module	stmt_loop.i
	.area	_CODE
main:
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#51
.2:
	ld	hl,#0
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ld	hl,#0
	add	hl,sp
	dec	(hl)
	ld	hl,#0
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#48
	pop	de
	call	.gt
	ld	a,h
	or	l
	jp	z,.3
	jp	.2
.3:
	inc	sp
	ret
	.area	_BSS
