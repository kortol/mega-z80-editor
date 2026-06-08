	.globl	gets
	.globl	main
	.module	cpm_gets.i
	.area	_CODE
main:
	ld	hl,#.0+0
	push	hl
	call	gets
	pop	bc
	ret
	.area	_DATA
.0:	.ds	16
	.area	_BSS
